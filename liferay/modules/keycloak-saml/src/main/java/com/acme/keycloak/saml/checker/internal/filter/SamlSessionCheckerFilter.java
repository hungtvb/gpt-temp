package com.acme.keycloak.saml.checker.internal.filter;

import com.liferay.portal.kernel.exception.PortalException;
import com.liferay.saml.persistence.model.SamlSpSession;
import com.liferay.saml.persistence.service.SamlSpSessionLocalService;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import java.io.IOException;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(
    property = {
        "servlet-filter-name=Custom SAML Session Checker",
        "dispatcher=REQUEST",
        "url-pattern=/*"
    },
    service = Filter.class
)
public class SamlSessionCheckerFilter implements Filter {

    @Override
    public void doFilter(
        ServletRequest request, ServletResponse response,
        FilterChain chain)
        throws IOException, ServletException {

        HttpServletRequest httpServletRequest =
            (HttpServletRequest)request;

        HttpSession httpSession = httpServletRequest.getSession(false);

        if (httpSession != null) {
            try {
                SamlSpSession samlSpSession =
                    _samlSpSessionLocalService.getSamlSpSessionByJSessionId(
                        httpSession.getId());

                if (samlSpSession != null) {
                    // Replace this with the project-specific assertion/session policy.
                }
            }
            catch (PortalException portalException) {
                throw new ServletException(
                    "Unable to resolve SAML SP session", portalException);
            }
        }

        chain.doFilter(request, response);
    }

    @Reference
    private SamlSpSessionLocalService _samlSpSessionLocalService;
}
